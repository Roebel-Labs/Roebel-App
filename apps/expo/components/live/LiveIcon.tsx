// Live-room icons: the app's own custom SVG icons (assets/icons, currentColor) wherever there is an equivalent,
// Ionicons only as the fallback for glyphs the custom set lacks (Max, 2026-11-06). Same props as Ionicons.
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MenuSvg from '@/assets/icons/menu-01.svg';
import HeartSvg from '@/assets/icons/heart-02.svg';
import HeartFilledSvg from '@/assets/icons/heart-02-filled.svg';
import InfoSvg from '@/assets/icons/info.svg';
import SettingsSvg from '@/assets/icons/settings-01.svg';
import PlaySvg from '@/assets/icons/play.svg';
import ExpandSvg from '@/assets/icons/expand.svg';
import ViewSvg from '@/assets/icons/view.svg';
import VideoSvg from '@/assets/icons/video-01.svg';
import ArrowUpSvg from '@/assets/icons/arrow-up-big.svg';
import CheckSvg from '@/assets/icons/check.svg';
import CoinsSvg from '@/assets/icons/coins-01.svg';
import MoreSvg from '@/assets/icons/more-02.svg';
import LockSvg from '@/assets/icons/square-lock-02.svg';
import MailSvg from '@/assets/icons/mail-01.svg';
import CallSvg from '@/assets/icons/call.svg';
import ChevronRightSvg from '@/assets/icons/chevron-right.svg';
import ShareSvg from '@/assets/icons/share-02.svg';

type IonName = React.ComponentProps<typeof Ionicons>['name'];
type SvgIcon = React.ComponentType<{ width?: number; height?: number; color?: string; style?: StyleProp<ViewStyle> }>;

const CUSTOM: Partial<Record<IonName, SvgIcon>> = {
  list: MenuSvg,
  heart: HeartFilledSvg,
  'heart-outline': HeartSvg,
  'information-circle-outline': InfoSvg,
  'settings-outline': SettingsSvg,
  play: PlaySvg,
  expand: ExpandSvg,
  'eye-outline': ViewSvg,
  videocam: VideoSvg,
  'videocam-outline': VideoSvg,
  'arrow-up': ArrowUpSvg,
  checkmark: CheckSvg,
  'cash-outline': CoinsSvg,
  'ellipsis-horizontal': MoreSvg,
  'ellipsis-horizontal-circle-outline': MoreSvg,
  'lock-closed': LockSvg,
  'lock-closed-outline': LockSvg,
  'mail-unread-outline': MailSvg,
  call: CallSvg,
  'chevron-forward': ChevronRightSvg,
  'share-outline': ShareSvg,
  'share-social-outline': ShareSvg,
};

type Props = {
  name: IonName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function LiveIcon({ name, size = 20, color = '#FFFFFF', style, accessibilityLabel }: Props) {
  const Custom = CUSTOM[name];
  if (Custom) return <Custom width={size} height={size} color={color} style={style} />;
  return <Ionicons name={name} size={size} color={color} style={style as never} accessibilityLabel={accessibilityLabel} />;
}
