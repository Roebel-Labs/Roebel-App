const { withPodfileProperties } = require('expo/config-plugins');

/**
 * XMTP's iOS pod hard-depends on SQLCipher (XMTPReactNative.podspec →
 * SQLCipher 4.5.7). SQLCipher's headers/symbols collide with the iOS SYSTEM
 * SQLite3 clang module that expo-updates imports by default, failing the
 * Xcode build with "unknown type name 'sqlite3_stmt'" / "could not build
 * Objective-C module 'SQLite3'" (EAS build 850b3de5, 2026-07-12).
 *
 * Expo's sanctioned coexistence switch (expo/expo#30824): point expo-updates
 * at the namespaced third-party sqlite3 pod instead of the system module.
 */
module.exports = function withXmtpThirdPartySQLite(config) {
  return withPodfileProperties(config, (config) => {
    config.modResults['expo.updates.useThirdPartySQLitePod'] = 'true';
    return config;
  });
};
