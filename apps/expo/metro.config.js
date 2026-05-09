// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require("expo/metro-config");
/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Sentinel module names → real file paths inside thirdweb's `dist/esm/`.
// Used by lib/wallet-key.ts to reach internal helpers that thirdweb's package
// "exports" map does not publish. We locate the package via its (public)
// package.json and join from there — Node's require.resolve refuses deep
// `dist/*` paths since they are not in `exports`. Re-validate on every
// thirdweb upgrade.
const thirdwebRoot = path.dirname(require.resolve('thirdweb/package.json'));
const THIRDWEB_INTERNAL = {
  'thirdweb-internal/retrieval': path.join(
    thirdwebRoot,
    'dist/esm/wallets/in-app/native/helpers/wallet/retrieval.js'
  ),
  'thirdweb-internal/client-scoped-storage': path.join(
    thirdwebRoot,
    'dist/esm/wallets/in-app/core/authentication/client-scoped-storage.js'
  ),
  'thirdweb-internal/native-storage': path.join(
    thirdwebRoot,
    'dist/esm/utils/storage/nativeStorage.js'
  ),
};

// SVG transformer configuration
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

// Add Node.js polyfills for React Native
config.resolver.extraNodeModules = {
  crypto: require.resolve('react-native-quick-crypto'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
  process: require.resolve('process/browser.js'),
  path: require.resolve('path-browserify'),
  os: require.resolve('os-browserify/browser'),
  http: require.resolve('http-browserify'),
  https: require.resolve('https-browserify'),
  url: require.resolve('url'),
  assert: require.resolve('assert'),
  util: require.resolve('util'),
  querystring: require.resolve('querystring'),
  events: require.resolve('events'),
  net: require.resolve('react-native-tcp-socket'),
  tls: require.resolve('react-native-tcp-socket'),
  ws: require.resolve('isomorphic-ws'),
};

// Ensure these globals are available
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Block problematic server modules
config.resolver.blockList = [
  /ws\/lib\/websocket-server\.js$/,
  /ws\/wrapper\.mjs$/,
];

// Custom resolver to exclude problematic modules from bundle
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Redirect thirdweb-internal/* sentinels to the real internal files.
  if (moduleName in THIRDWEB_INTERNAL) {
    return { type: 'sourceFile', filePath: THIRDWEB_INTERNAL[moduleName] };
  }

  // Exclude react-native-mmkv (all platforms)
  if (moduleName === 'react-native-mmkv' || moduleName.includes('react-native-mmkv')) {
    return { type: 'empty' };
  }

  // Exclude native-only modules on web
  if (platform === 'web') {
    const webExclude = [
      'react-native-tcp-socket',
      'react-native-quick-crypto',
      'react-native-aes-gcm-crypto',
      'react-native-passkey',
      '@rnmapbox/maps',
      '@coinbase/wallet-mobile-sdk',
      '@walletconnect/react-native-compat',
      'react-native-qrcode-svg',
      'expo-screen-orientation',
      'react-native-web-webview',
      'react-native-pager-view',
    ];
    if (webExclude.some(pkg => moduleName === pkg || moduleName.startsWith(pkg + '/'))) {
      return { type: 'empty' };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
