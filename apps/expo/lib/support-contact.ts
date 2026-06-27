/**
 * Support / admin contact for the in-app "Weitere Hilfe" action.
 *
 * `SUPPORT_ACCOUNT_ID` is the personal `accounts.id` (Supabase UUID) of the
 * admin (Max Brych) who fields help requests. When set, "Weitere Hilfe" opens a
 * 1:1 direct-message chat with this account; when empty, callers should fall
 * back to the Hilfe & Tipps hub (`/help`).
 *
 * Kept in one place so it is trivial to rotate without touching UI code.
 */
export const SUPPORT_ACCOUNT_ID = '182a6f97-e02f-4379-bb0b-b467b74c6da9';

/** Display name for the support contact (used for labels/aria, never a wallet). */
export const SUPPORT_CONTACT_NAME = 'Max Brych';
