/**
 * WalletConfirmSheet — the host-native confirmation sheet shown before EVERY
 * signature/transaction a mini app requests (spec §4.2: "no blind signing").
 *
 * The mini app can never sign silently: `MiniAppHost.walletRequest` decodes the
 * EIP-1193 request into a `WalletConfirmRequest`, shows this Modal, and resolves
 * only when the user taps "Bestätigen". "Ablehnen" rejects the bridge call with
 * `{ code: 'user_rejected' }`.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import SheetModal from '@/components/ui/SheetModal';
import { fontFamily } from '@/constants/theme';

export type WalletConfirmKind = 'transaction' | 'personal_sign' | 'typed_data';

export interface WalletConfirmRequest {
  kind: WalletConfirmKind;
  /** Human title, German. */
  title: string;
  /** App name requesting the action (for the sub-header). */
  appName: string;
  /** Decoded rows: [label, value] pairs shown in the sheet. */
  rows: { label: string; value: string; mono?: boolean }[];
  /** Optional raw payload preview (message / calldata), shown collapsed-ish. */
  raw?: string;
  /** Shown in a warning box above the buttons (e.g. a call the mini app did not declare). */
  warning?: string;
  /** Label of the confirm button; defaults to Bezahlen (transaction) / Signieren. */
  cta?: string;
}

type Props = {
  visible: boolean;
  request: WalletConfirmRequest | null;
  busy?: boolean;
  onConfirm: () => void;
  onReject: () => void;
};

export default function WalletConfirmSheet({
  visible,
  request,
  busy,
  onConfirm,
  onReject,
}: Props) {
  const { colors } = useTheme();

  const ctaLabel =
    request?.cta ?? (request?.kind === 'transaction' ? 'Bezahlen' : 'Signieren');

  return (
    <SheetModal
      visible={visible && !!request}
      onRequestClose={onReject}
      onBackdropPress={busy ? undefined : onReject}
      // Inner ScrollView + a signing decision: no swipe-to-reject.
      dragToDismiss={false}
    >
        <View style={[styles.sheet, { backgroundColor: colors.sheet, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {request && (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {request.title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Angefordert von {request.appName}
              </Text>

              <ScrollView
                style={styles.rows}
                contentContainerStyle={styles.rowsContent}
                showsVerticalScrollIndicator={false}
              >
                {request.rows.map((row, i) => (
                  <View
                    key={`${row.label}-${i}`}
                    style={[styles.row, { borderBottomColor: colors.borderSecondary }]}
                  >
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>
                      {row.label}
                    </Text>
                    <Text
                      style={[
                        styles.rowValue,
                        { color: colors.textPrimary },
                        row.mono && { fontFamily: fontFamily.mono },
                      ]}
                      numberOfLines={2}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))}

                {request.raw ? (
                  <View style={[styles.rawBox, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text
                      style={[styles.rawText, { color: colors.textSecondary }]}
                      numberOfLines={4}
                    >
                      {request.raw}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>

              {request.warning ? (
                <View
                  style={[
                    styles.warningBox,
                    { backgroundColor: colors.warningBackground, borderColor: colors.warning },
                  ]}
                  accessibilityRole="alert"
                >
                  <Text style={[styles.warningText, { color: colors.textPrimary }]}>
                    {request.warning}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnGhost, { borderColor: colors.border }]}
                  onPress={onReject}
                  disabled={busy}
                >
                  <Text style={[styles.btnGhostText, { color: colors.textPrimary }]}>
                    Ablehnen
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.btn,
                    styles.btnPrimary,
                    { backgroundColor: colors.primary },
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={onConfirm}
                  disabled={busy}
                >
                  <Text style={[styles.btnPrimaryText, { color: colors.onPrimary }]}>
                    {busy ? 'Wird gesendet…' : ctaLabel}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 20,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginBottom: 16,
  },
  rows: {
    flexGrow: 0,
  },
  rowsContent: {
    paddingBottom: 8,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginBottom: 3,
  },
  rowValue: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  rawBox: {
    marginTop: 12,
    borderRadius: 10,
    padding: 12,
  },
  rawText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    lineHeight: 15,
  },
  warningBox: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  warningText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    borderWidth: 1,
  },
  btnGhostText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
  btnPrimary: {},
  btnPrimaryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
  },
});
