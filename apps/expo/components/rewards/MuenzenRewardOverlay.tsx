import React from 'react';
import { Modal } from 'react-native';
import MuenzenRewardView, { DEFAULT_REWARD_SUBTITLE } from './MuenzenRewardView';

interface MuenzenRewardOverlayProps {
  visible: boolean;
  /** How many Röbel Münzen the user just received (already rounded). */
  amount: number;
  /** Optional copy override; defaults to the standard reward line. */
  subtitle?: string;
  /** Headline text to reveal instead of a number (e.g. a vote thank-you). */
  message?: string;
  /** Show the screen in a loading state (spinner + label) until resolved. */
  loading?: boolean;
  loadingLabel?: string | string[];
  /** Coin variant to show while loading (before the amount is known). */
  coin?: 'single' | 'many';
  /** Changes per celebration so the entrance animation replays each time. */
  replayKey?: number;
  onClose: () => void;
}

/**
 * Full-screen celebration shown every time a citizen receives Röbel Münzen —
 * daily mint, completed tasks, checkpoint scans, votes, and so on.
 */
export default function MuenzenRewardOverlay({
  visible,
  amount,
  subtitle,
  message,
  loading = false,
  loadingLabel,
  coin,
  replayKey = 0,
  onClose,
}: MuenzenRewardOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? (
        <MuenzenRewardView
          key={replayKey}
          amount={amount}
          subtitle={subtitle ?? DEFAULT_REWARD_SUBTITLE}
          message={message}
          loading={loading}
          loadingLabel={loadingLabel}
          coin={coin}
          onContinue={onClose}
        />
      ) : null}
    </Modal>
  );
}
