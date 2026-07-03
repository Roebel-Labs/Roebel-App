/**
 * @netizen/miniapp-sdk — client entry.
 *
 * Usage in a mini app:
 *   import { sdk } from '@netizen/miniapp-sdk';
 *   useEffect(() => { sdk.actions.ready(); }, []);
 */
import { createClient } from './client';
import type { NetizenSDK } from './types';

/** Singleton client SDK. A mini app bundles this and talks to whatever host embeds it. */
export const sdk: NetizenSDK = createClient();

export { createClient };
export * from './types';
