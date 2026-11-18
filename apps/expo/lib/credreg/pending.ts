/**
 * Waiting stamps (spec 5.6b / 5.3): the person's public/private wish for a badge, remembered on
 * the device from the stamp moment until the organiser's batch arrives. Never logs (keys hold an
 * address).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type BadgeWish = 'public' | 'private';

export const badgeWishKey = (address: string, eventId: string) => `credreg:badge-wish:v1:${address.toLowerCase()}:${eventId}`;

export async function setBadgeWish(address: string, eventId: string, wish: BadgeWish): Promise<void> {
  try {
    await AsyncStorage.setItem(badgeWishKey(address, eventId), wish);
  } catch {
    // best effort: without a wish the normal accept screen asks
  }
}

export async function getBadgeWish(address: string, eventId: string): Promise<BadgeWish | null> {
  try {
    const v = await AsyncStorage.getItem(badgeWishKey(address, eventId));
    return v === 'public' || v === 'private' ? v : null;
  } catch {
    return null;
  }
}
