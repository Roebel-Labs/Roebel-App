import type { MiniAppPermission } from '@netizen-labs/miniapp-sdk';

export const PERMISSION_LABELS: Record<MiniAppPermission, string> = {
  wallet: 'Wallet & Signaturen',
  rewards: 'Röbel-Münzen-Belohnungen',
  notifications: 'Benachrichtigungen',
  circles: 'Röbel-Münzen-Guthaben',
  share: 'Teilen',
};

/** One-line banner for the developer preview: which permissions it simulates. */
export function previewBannerText(permissions: MiniAppPermission[]): string {
  if (permissions.length === 0) return 'Vorschau · keine Berechtigungen simuliert';
  return `Vorschau · simuliert: ${permissions.map((p) => PERMISSION_LABELS[p] ?? p).join(', ')}`;
}
