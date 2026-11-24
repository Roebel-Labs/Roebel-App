import type React from 'react';
import type { MainTab } from '@/lib/navigation/goToTab';
import HomeStroke from '@/assets/icons/bottom-nav/home.svg';
import HomeFilled from '@/assets/icons/bottom-nav/home-filled.svg';
import DiscoverStroke from '@/assets/icons/bottom-nav/discover.svg';
import DiscoverFilled from '@/assets/icons/bottom-nav/discover_fill.svg';
import DashboardStroke from '@/assets/icons/bottom-nav/dashboard.svg';
import DashboardFilled from '@/assets/icons/bottom-nav/dashboard-filled.svg';
import ChatStroke from '@/assets/icons/bottom-nav/chat.svg';
import ChatFilled from '@/assets/icons/bottom-nav/chat-filled.svg';
import UserStroke from '@/assets/icons/bottom-nav/user-circle.svg';
import UserFilled from '@/assets/icons/bottom-nav/user-circle-filled.svg';
import OrgStroke from '@/assets/icons/bottom-nav/user-multiple.svg';
import OrgFilled from '@/assets/icons/bottom-nav/user-multiple-filled.svg';

type Icon = React.ComponentType<{ width: number; height: number; color: string }>;
export type TabItem = { key: MainTab; label: string; stroke: Icon; filled: Icon };

const ITEMS: Record<MainTab, Omit<TabItem, 'key'>> = {
  home: { label: 'Austausch', stroke: HomeStroke, filled: HomeFilled },
  explore: { label: 'Erkunden', stroke: DiscoverStroke, filled: DiscoverFilled },
  dashboard: { label: 'Dashboard', stroke: DashboardStroke, filled: DashboardFilled },
  chat: { label: 'Chat', stroke: ChatStroke, filled: ChatFilled },
  profile: { label: 'Profil', stroke: UserStroke, filled: UserFilled },
};

/** Bar items for the given shell, in shell order. Org accounts get the group icon on Profil. */
export function bottomNavItems(tabs: MainTab[], opts: { org?: boolean } = {}): TabItem[] {
  return tabs.map((key) =>
    key === 'profile' && opts.org
      ? { key, label: 'Profil', stroke: OrgStroke, filled: OrgFilled }
      : { key, ...ITEMS[key] }
  );
}
