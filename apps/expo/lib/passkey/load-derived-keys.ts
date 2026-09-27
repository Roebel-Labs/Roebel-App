/**
 * Lazy loader for derived-keys-runtime (native passkey code). Callers load it only on a passkey
 * session, so thirdweb sessions and builds without react-native-passkey never evaluate it.
 * Its own module so tests can mock the loader (jest here cannot run a dynamic import()).
 */
export const loadDerivedKeysRuntime = () => import('./derived-keys-runtime');
