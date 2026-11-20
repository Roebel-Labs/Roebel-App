/**
 * The device's phrase store (phrase-store.ts) on expo-secure-store. Native only: on web
 * `canUseBiometricAuthentication` is missing, so `canProtect()` is false and no words account
 * can be created there.
 */
import * as ExpoSecureStore from 'expo-secure-store';
import { createPhraseStore, type PhraseStore, type SecureStoreLike } from './phrase-store';

export const phraseStore: PhraseStore = createPhraseStore(ExpoSecureStore as unknown as SecureStoreLike);
