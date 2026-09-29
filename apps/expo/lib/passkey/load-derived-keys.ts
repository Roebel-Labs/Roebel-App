/**
 * Lazy loader for derived-keys-runtime (native passkey code). Callers load it only on a passkey
 * session, so thirdweb sessions and builds without react-native-passkey never evaluate it.
 * Its own module so tests can mock the loader (jest here cannot run a dynamic import()).
 */
export const loadDerivedKeysRuntime = () => import('./derived-keys-runtime');
/** Lazy loader for maci-key-runtime (the passkey MACI key resolver; native passkey code). */
export const loadMaciKeyRuntime = () => import('./maci-key-runtime');
